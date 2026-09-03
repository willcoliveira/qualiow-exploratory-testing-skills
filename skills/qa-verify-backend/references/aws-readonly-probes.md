# AWS Read-Only Probe Catalogue

Every command here is read-only. Set once per session:

```bash
export AWS_PROFILE="$QA_AWS_PROFILE"    # or --profile on each call
export AWS_REGION="$QA_AWS_REGION"     # the region the target declares
aws sts get-caller-identity             # ALWAYS first — confirm the account
```

Save raw output to `evidence/` before interpreting. `--output json | jq` keeps it
diffable.

---

## Resource Existence — prove names before trusting them

```bash
aws dynamodb list-tables --query "TableNames[?contains(@, '<fragment>')]"
aws lambda list-functions --query "Functions[?contains(FunctionName, '<fragment>')].FunctionName"
aws sqs list-queues --queue-name-prefix <prefix>
```

A target config's resource names are an assertion. Confirm them, and treat a naming
mismatch between related resources (different prefixes, different env suffixes) as a
finding worth chasing — it usually means one of them is wired to nothing.

---

## DynamoDB — table design and streams

```bash
# Key schema, attributes, encryption, PITR, and the stream spec in one shot
aws dynamodb describe-table --table-name <table> \
  --query 'Table.{Keys:KeySchema,Attrs:AttributeDefinitions,Stream:StreamSpecification,StreamArn:LatestStreamArn,SSE:SSEDescription,Status:TableStatus}'

# Point-in-time recovery is a separate call
aws dynamodb describe-continuous-backups --table-name <table>
```

Read: `StreamEnabled`, and `StreamViewType` (`NEW_IMAGE` / `OLD_IMAGE` /
`NEW_AND_OLD_IMAGES` / `KEYS_ONLY`) against what the AC requires. A wider view type
than specified is not harmless — it changes what the consumer receives and what ends
up stored.

```bash
# Inspect real records — the shape, not just the count
aws dynamodb query --table-name <audit-table> \
  --key-condition-expression '#pk = :pk' \
  --expression-attribute-names '{"#pk":"<pk-name>"}' \
  --expression-attribute-values '{":pk":{"S":"<entity-id>"}}' \
  --limit 5

# Does data matching a cleanup criterion still exist? (scan is read-only)
aws dynamodb scan --table-name <table> \
  --filter-expression '#t = :v' \
  --expression-attribute-names '{"#t":"itemType"}' \
  --expression-attribute-values '{":v":{"S":"Variable"}}' \
  --projection-expression 'entityId, itemId' --output table
```

Scans read the whole table and cost read capacity. Project only the attributes you need
and prefer the smallest table. Never scan a large production table.

---

## Lambda — trigger wiring and configuration

```bash
aws lambda get-function-configuration --function-name <fn> \
  --query '{Env:Environment.Variables,Role:Role,Timeout:Timeout,Memory:MemorySize,Runtime:Runtime}'

# The event source mapping is where triggers actually live
aws lambda list-event-source-mappings --function-name <fn> \
  --query 'EventSourceMappings[].{Src:EventSourceArn,State:State,Batch:BatchSize,Window:MaximumBatchingWindowInSeconds,Retries:MaximumRetryAttempts,Split:BisectBatchOnFunctionError,Resp:FunctionResponseTypes,OnFailure:DestinationConfig.OnFailure.Destination,Last:LastProcessingResult}'
```

Two fields decide whether an async pipeline loses data silently:

- **`FunctionResponseTypes` containing `ReportBatchItemFailures`** — without it, a
  handler that carefully returns per-item failures is ignored and the whole batch is
  marked successful. The code looks correct and the data still vanishes.
- **`DestinationConfig.OnFailure`** — without a destination, exhausted retries are
  dropped with no trace beyond a metric.

Check `Environment.Variables` for the log level. A trace/debug level on a function that
logs whole event payloads means personal data is being written to the log platform.

---

## IAM — prove both the allows and the denies

```bash
aws iam get-role --role-name <role> --query 'Role.{Arn:Arn}'
aws iam list-attached-role-policies --role-name <role>
aws iam get-policy-version --policy-arn <arn> \
  --version-id "$(aws iam get-policy --policy-arn <arn> --query 'Policy.DefaultVersionId' --output text)" \
  --query 'PolicyVersion.Document'

# Effective permissions — the authoritative answer
aws iam simulate-principal-policy \
  --policy-source-arn <role-arn> \
  --action-names dynamodb:PutItem dynamodb:GetItem dynamodb:Query dynamodb:DeleteItem dynamodb:UpdateItem \
  --resource-arns <table-arn> \
  --query 'EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision}' --output table
```

For a "write-only" AC, `PutItem` must be `allowed` **and** `GetItem`, `Query`,
`UpdateItem`, `DeleteItem` must all be `implicitDeny`. Only proving the allow is half
the check — and it is the half that never catches an over-broad policy.

Note policies that exist but are attached to nothing. They are usually scope creep from
a future ticket; harmless today, but they drift out of review.

---

## SQS — is anything already being lost?

```bash
aws sqs get-queue-attributes --queue-url <dlq-url> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

# Read without consuming: visibility 0, and do NOT delete the message
aws sqs receive-message --queue-url <dlq-url> --max-number-of-messages 1 --visibility-timeout 0
```

A non-empty DLQ is a live incident, not a test artifact. Check it before and after any
end-to-end trigger.

---

## CloudWatch — errors and log hygiene

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value=<fn> \
  --start-time <iso> --end-time <iso> --period 3600 --statistics Sum

aws logs filter-log-events --log-group-name /aws/lambda/<fn> \
  --start-time <epoch-ms> --filter-pattern 'ERROR' --max-items 20
```

Also read a normal (non-error) log line. What a healthy invocation logs is where PII
exposure hides — an error-only filter will never show you the payload dump.

---

## Terraform

```bash
terraform fmt -check -recursive <dir>
terraform validate            # requires init; run only in a scratch copy
```

Prefer reading the `.tf` source with `git show`. Never run `plan` against a real
workspace without asking — it needs credentials and can create state locks.

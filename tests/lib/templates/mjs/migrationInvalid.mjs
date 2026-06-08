import { PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function up(ddb) {
  await ddb.send(
    new PutItemCommand({
      TableName: "CUSTOMER",
      Item: {
        CUSTOMER_ID: { S: "001" },
        CUSTOMER_NAME: { S: "dummy" },
      },
    }),
  );
}

export async function down(ddb) {
  await ddb.send(
    new PutItemCommand({
      TableName: "CUSTOMER",
      Item: {
        CUSTOMER_ID: { S: "001" },
        CUSTOMER_NAME: { S: "dummy" },
      },
    }),
  );
}

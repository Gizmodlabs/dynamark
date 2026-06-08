const { PutItemCommand } = require("@aws-sdk/client-dynamodb");

module.exports = {
  async up(ddb) {
    await ddb.send(
      new PutItemCommand({
        TableName: "CUSTOMER",
        Item: {
          CUSTOMER_ID: { S: "001" },
          CUSTOMER_NAME: { S: "dummy" },
        },
      }),
    );
  },

  async down(ddb) {
    await ddb.send(
      new PutItemCommand({
        TableName: "CUSTOMER",
        Item: {
          CUSTOMER_ID: { S: "001" },
          CUSTOMER_NAME: { S: "dummy" },
        },
      }),
    );
  },
};

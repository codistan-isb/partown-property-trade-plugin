export default async function createTradeTransaction(context, args) {
  const { Transactions } = context.collections;

  await Transactions.insertOne(args);
}

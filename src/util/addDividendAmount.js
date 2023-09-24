export default async function addDividendAmount(
  collections,
  accountId,
  amount,
  productId
) {
  const { Accounts, Dividends } = collections;
  const { result } = await Accounts.updateOne(
    {
      _id: accountId,
    },
    { $inc: { "wallets.amount": amount } }
  );

  await Dividends.updateOne(
    {
      dividendTo: accountId,
      productId,
    },
    { $inc: { amount: amount } },
    { upsert: true }
  );

  return result?.n > 0;
}

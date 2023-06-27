export default async function addDividendAmount(
  collections,
  accountId,
  amount
) {
  const { Accounts } = collections;
  const { result } = await Accounts.updateOne(
    {
      _id: accountId,
    },
    { $inc: { "wallets.amount": amount } }
  );
  return result?.n > 0;
}

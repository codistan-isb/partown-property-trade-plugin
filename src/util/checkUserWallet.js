export default async function checkUserWallet(
  collections,
  userId,
  amountToCheck
) {
  const { Accounts } = collections;
  let { wallets } = await Accounts.findOne({ _id: userId });
  if (wallets === undefined || wallets?.amount < amountToCheck)
    throw new Error(
      `Insufficient Funds, Please add funds to your wallet, you need an additional ₦${
        amountToCheck - wallets?.amount
      }`
    );
}

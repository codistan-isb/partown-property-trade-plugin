export default async function checkUserWallet(
  collections,
  userId,
  amountToCheck,
  message
) {
  let msg =
    "Insufficient Funds, Please add funds to your wallet, you need an additional";
  if (message) {
    msg = message;
  }
  const { Accounts } = collections;
  let { wallets } = await Accounts.findOne({ _id: userId });
  console.log("wallet is ", wallets);
  console.log("amount to check is ", amountToCheck);
  if (wallets === undefined || wallets?.amount < amountToCheck)
    throw new Error(
      `${msg} ₦${amountToCheck - (wallets?.amount ? wallets?.amount : 0)}`
    );
}

export default async function checkTrusteeWallet(
  collections,
  userId,
  amountToCheck,
  message
) {
  let msg =
    "The Trustee/Manager does not have enough funds to award this dividend";
  if (message) {
    msg = message;
  }
  console.log("user id in ", userId);

  const { Accounts } = collections;
  let { wallets } = await Accounts.findOne({ _id: userId });

  if (wallets === undefined || wallets?.amount < amountToCheck)
    throw new Error(
      `${msg} an additional ₦${
        amountToCheck - (wallets?.amount ? wallets?.amount : 0)
      } are required`
    );
}

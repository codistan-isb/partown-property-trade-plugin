export default async function validateUser(context, accountId) {
  const { collections } = context;
  const { Accounts } = collections;
  let res = await Accounts.findOne({
    _id: accountId,
  });
  if (res?.isBanned === true) {
    throw new Error("Your account is banned");
  }

  if (res?.identityVerified === false) {
    throw new Error("Your account is pending verification");
  }
}

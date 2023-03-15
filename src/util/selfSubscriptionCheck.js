export default async function selfSubscriptionCheck(collections, ownerId) {
  const { Ownership } = collections;
  const selfSubscribeCheck = await Ownership.findOne({ ownerId });
  if (selfSubscribeCheck)
    throw new Error("You have already subscribed to this property");
}

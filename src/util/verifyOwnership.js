export default async function verifyOwnership(
  collections,
  sellerId,
  productId,
  amountToCheck
) {
  const { Ownership } = collections;
  const owner = await Ownership.findOne({
    ownerId: sellerId,
    productId: productId,
  });
  console.log("owner", owner);
  if (!owner) throw new Error("You don't own this property");

  const { amount } = owner;
  if (amount < amountToCheck) {
    throw new Error(
      `You hold ${amount} units for this property, you cannot sell more than ${amount} units`
    );
  }
}

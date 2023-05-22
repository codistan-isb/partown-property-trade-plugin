import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

//Remove Owner if the owned amount and escrow becomes zero after trading

export default async function removeOwnership(collections, ownerId, productId) {
  const { Ownership } = collections;

  const decodedOwnerId = decodeOpaqueId(ownerId).id;

  const decodedProductId = decodeOpaqueId(productId).id;
  const { amount, unitsEscrow } = await Ownership.findOne({
    ownerId: decodedOwnerId,
    productId: decodedProductId,
  });

  if (amount === 0 && unitsEscrow === 0) {
    const { result } = await Ownership.remove({
      ownerId: decodedOwnerId,
      productId: decodedProductId,
    });

    return result?.n > 0;
  }

  return false;
}

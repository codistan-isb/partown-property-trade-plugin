export default async function updateAvailableQuantity(
  collections,
  productId,
  units
) {
  const { Catalog } = collections;
  const { result } = await Catalog.update(
    {
      "product._id": productId,
    },
    { $inc: { "product.area.availableQuantity": units } }
  );

  return result?.n > 0;
}

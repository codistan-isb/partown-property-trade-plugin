import _ from "lodash";
import ReactionError from "@reactioncommerce/reaction-error";
import generateSignedUrl from "./signedUrls.js";

export default async function sendTradeEmail(
  context,
  propertyTitle,
  units,
  email,
  fullName,
  profileImage,
  propertyImage,
  propertyUrl
) {
  const {
    collections: { Accounts, Shops },
  } = context;

  console.log("*******in trade email", propertyImage);

  const bodyTemplate = "transaction/success";

  const shop = await Shops.findOne({ shopType: "primary" });
  if (!shop) throw new ReactionError("not-found", "Shop not found");

  console.log("buyer image is ", profileImage);

  const logoImage = "https://i.imgur.com/xgJX3WK.jpeg";
  const dataForEmail = {
    propertyTitle,
    profileImage: await generateSignedUrl(profileImage),
    propertyImage: await generateSignedUrl(propertyImage),
    contactEmail: _.get(shop, "emails[0].address"),
    buyerName: fullName,
    units,
    logoImage,
    propertyUrl,
    website: "https://dev.partown.co/",
    email: "dev@partown.co",
    linkedIn: "https://linkedin.com/",
  };

  const language = shop.language;

  return context.mutations.sendEmail(context, {
    data: dataForEmail,
    fromShop: shop,
    templateName: bodyTemplate,
    language,
    to: email,
  });
}

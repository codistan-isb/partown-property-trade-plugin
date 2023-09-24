import _ from "lodash";
import ReactionError from "@reactioncommerce/reaction-error";
import generateSignedUrl from "./signedUrls.js";

export default async function sendTradeEmail(
  context,
  propertyTitle,
  units,
  price,
  propertyUrl,
  description,
  firstName,
  lastName,
  email
) {
  const {
    collections: { Accounts, Shops },
  } = context;

  const bodyTemplate = "transaction/success";

  const shop = await Shops.findOne({ shopType: "primary" });
  if (!shop) throw new ReactionError("not-found", "Shop not found");

  const currentYear = new Date().getFullYear();
  const facebook = process.env.FACEBOOK;
  const instagram = process.env.INSTAGRAM;
  const twitter = process.env.TWITTER;

  const dataForEmail = {
    propertyTitle,
    firstName,
    lastName,
    description,
    unitsQuantity: units,
    price,
    propertyUrl,
    currentYear,
    facebook,
    twitter,
    instagram,
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

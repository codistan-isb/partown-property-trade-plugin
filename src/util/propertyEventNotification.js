import _ from "lodash";

export default async function propertyEventNotification(
  context,
  accountId,
  eventTitle,
  eventDetails,
  propertyLink
) {
  const account = await context.collections.Accounts.findOne({
    _id: accountId,
  });

  

  let email = _.get(account, "emails.0.address");
  let phoneNumber = _.get(account, "profile.phone");
  let firstName = _.get(account, "profile.firstName");
  let lastName = _.get(account, "profile.lastName");

  const fullName = `${firstName} ${lastName}`;

  const hasEnabledEmailNotification = _.get(
    account,
    "userPreferences.contactPreferences.email"
  );
  const hasEnabledSMSNotification = _.get(
    account,
    "userPreferences.contactPreferences.sms"
  );

  if (hasEnabledEmailNotification) {
    const { Shops } = context.collections;
    const bodyTemplate = "property/event";

    const shop = await Shops.findOne({ shopType: "primary" });
    if (!shop) throw new ReactionError("not-found", "Shop not found");

    const currentYear = new Date().getFullYear();

    const dataForEmail = {
      eventTitle,
      fullName,
      eventDetails,
      propertyLink,
      currentYear,
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
  if (hasEnabledSMSNotification) {
    await context.mutations.sendPhoneNotification(
      phoneNumber,
      eventTitle,
      eventDetails
    );
  }
}

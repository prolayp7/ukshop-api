import { PrismaClient } from '@prisma/client';

// Legal pages (terms, privacy, cookies, accessibility) plus a "Legal" column in the footer menu.
// Business details are {{placeholders}} filled live from Admin > Settings > General (see
// src/modules/storefront/cms/page-content.ts), so the pages always state current details.
// Everything is seeded unpublished: pages as DRAFT and the footer links INACTIVE, so nothing goes
// live until the business details are filled in, the text has been reviewed, and an admin publishes.
// Idempotent: existing pages (matched by slug) and an existing Legal column are left untouched.
// Standalone: npx ts-node prisma/seed-legal-pages.ts

const UPDATED = '29 September 2026';

const BUSINESS_DETAILS = `<p><strong>{{companyName}}</strong><br>Registered in England and Wales, company number {{companyNumber}}<br>Registered office: {{companyAddress}}<br>VAT number: {{vatNumber}}<br>Email: {{supportEmail}} · Phone: {{supportPhone}}</p>`;

type Block = { heading?: string; body: string };

const PAGES: { slug: string; title: string; metaDescription: string; blocks: Block[] }[] = [
  {
    slug: 'terms-and-conditions',
    title: 'Terms & conditions',
    metaDescription: 'The terms that apply when you buy from us, including delivery, returns and your statutory rights.',
    blocks: [
      { body: `<p>Last updated: ${UPDATED}. These terms apply to every order placed on this website. Please read them before you order. Nothing in them affects your statutory rights as a consumer.</p>` },
      { heading: 'About us', body: `<p>This website is operated by:</p>${BUSINESS_DETAILS}` },
      { heading: 'Your order', body: '<p>When you place an order we send an email acknowledging it. That acknowledgement is not acceptance: the contract between us is formed when we email you to confirm your order has been dispatched. We may decline an order, for example if an item is out of stock, a price has been displayed in error, or we cannot verify payment; if we do, we will tell you and refund anything you have paid.</p>' },
      { heading: 'Prices and payment', body: '<p>Prices include VAT at the applicable rate. Delivery charges are shown at checkout before you pay. Payment is taken by our payment providers (Stripe, PayPal or 2Checkout); we never see or store your full card details.</p><p>If a price is clearly shown in error we will contact you before dispatch and you may cancel the order for a full refund.</p>' },
      { heading: 'Delivery', body: '<p>We deliver to addresses in the United Kingdom only. Delivery options, charges and estimated timescales are shown at checkout. Estimated dates are not guaranteed; if your order is significantly delayed we will let you know, and you may cancel it for a full refund.</p><p>Goods are your responsibility once delivered to the address you gave us, or to someone at that address.</p>' },
      { heading: 'Cancelling and returning an order', body: '<p>Under the Consumer Contracts Regulations 2013 you may cancel your order for any reason within 14 days of the day you receive the goods. We extend this: you can return unwanted items within <strong>30 days</strong> of delivery.</p><ul><li>Tell us within that period, for example from the Orders section of your account or by emailing {{supportEmail}}.</li><li>Return the items in their original condition and packaging. We may reduce your refund if an item has been handled beyond what is needed to check it.</li><li>Unless the item is faulty or we sent the wrong item, you pay the cost of returning it.</li><li>We refund the price and the standard delivery charge within 14 days of receiving the items back (or proof you have sent them), to your original payment method.</li></ul><p>This right does not apply to software or digital licences once you have opened, downloaded or activated them, or to items that have been personalised to your specification.</p>' },
      { heading: 'Faulty items', body: '<p>Under the Consumer Rights Act 2015, goods must be as described, fit for purpose and of satisfactory quality. If an item is faulty you can reject it for a full refund within 30 days of delivery. After 30 days you are entitled to a repair or replacement, and if that is not possible or fails, a price reduction or refund. Items also carry the manufacturer\'s warranty, which is in addition to your statutory rights.</p><p>To report a fault, contact us at {{supportEmail}} with your order number and a description of the problem.</p>' },
      { heading: 'Your account', body: '<p>Keep your password secure and do not share your account. You are responsible for orders placed using your account unless it was used without your permission and you were not at fault. You can close your account by contacting us.</p>' },
      { heading: 'Reviews and content you post', body: '<p>Product reviews and questions you submit must be honest and must not be unlawful, offensive or misleading. We may moderate, decline or remove content that breaks these rules.</p>' },
      { heading: 'Our liability', body: '<p>We are responsible for loss or damage you suffer that is a foreseeable result of us breaking these terms or failing to use reasonable care. We do not exclude or limit our liability where it would be unlawful to do so, including for death or personal injury caused by our negligence, fraud, or breach of your statutory rights. We are not liable for business losses where you buy as a consumer.</p>' },
      { heading: 'Complaints and governing law', body: '<p>If you have a complaint, please contact us at {{supportEmail}} and we will try to resolve it quickly. These terms are governed by the law of England and Wales. You may bring proceedings in the courts of England and Wales, or, if you live in Scotland or Northern Ireland, in the courts of your home nation.</p>' },
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    metaDescription: 'How we collect, use and protect your personal data, and your rights under UK data protection law.',
    blocks: [
      { body: `<p>Last updated: ${UPDATED}. This policy explains how we use your personal data when you visit this website, create an account or buy from us, and the rights you have under UK data protection law (the UK GDPR and the Data Protection Act 2018).</p>` },
      { heading: 'Who we are', body: `<p>The controller responsible for your personal data is:</p>${BUSINESS_DETAILS}<p>For any privacy question or request, email {{supportEmail}}.</p>` },
      { heading: 'Data we collect', body: '<ul><li><strong>Account details:</strong> your name, email address, phone number (optional) and password (stored only in encrypted, hashed form).</li><li><strong>Order details:</strong> delivery and billing addresses, the items you buy, order history, returns and refunds.</li><li><strong>Payment status:</strong> whether a payment succeeded and its reference. Card details are handled by our payment providers; we never receive or store your full card number.</li><li><strong>Content you send us:</strong> product reviews, questions, and messages to our support team.</li><li><strong>Newsletter:</strong> your email address, if you subscribe.</li><li><strong>Technical data:</strong> your IP address and basic request information, used to keep the site secure and prevent abuse.</li><li><strong>Analytics:</strong> how you use the site, only if you choose &ldquo;Accept all&rdquo; in our cookie banner (see our cookie policy).</li></ul>' },
      { heading: 'How we use it, and our lawful basis', body: '<ul><li><strong>To process and deliver your orders, manage returns and provide support</strong> - to perform our contract with you.</li><li><strong>To run your account and send service emails</strong> (verification codes, order and dispatch updates) - to perform our contract with you.</li><li><strong>To keep accounting and tax records</strong> - to comply with our legal obligations.</li><li><strong>To prevent fraud and keep the site secure</strong> - our legitimate interests.</li><li><strong>To send our newsletter</strong> - your consent, which you can withdraw at any time using the unsubscribe link or by contacting us.</li><li><strong>To understand how the site is used</strong> - your consent, given through the cookie banner.</li></ul>' },
      { heading: 'Who we share it with', body: '<p>We share only what each service needs to do its job:</p><ul><li>Payment providers (Stripe, PayPal, 2Checkout) to take payment.</li><li>Delivery companies (such as Evri and FedEx) to deliver your order.</li><li>Our email delivery provider, to send service emails and, if you subscribed, our newsletter.</li><li>Our hosting providers, who store data on our behalf.</li><li>Analytics and advertising providers (Google, Meta), only if you accept analytics cookies.</li></ul><p>We do not sell your personal data. Some providers may process data outside the UK; where they do, it is protected by an adequacy decision or approved safeguards such as the UK International Data Transfer Agreement.</p>' },
      { heading: 'How long we keep it', body: '<p>We keep order and payment records for six years after the end of the financial year they relate to, as UK tax law requires. Account details are kept while your account is open and deleted or anonymised when you ask us to close it, unless we must keep them for legal reasons. Newsletter subscriptions are kept until you unsubscribe.</p>' },
      { heading: 'Your rights', body: '<p>You have the right to access your personal data, to have it corrected or erased, to restrict or object to how we use it, to data portability, and to withdraw consent at any time. To make a request, email {{supportEmail}}. We will respond within one month.</p><p>If you are unhappy with how we have handled your data, you can complain to the Information Commissioner\'s Office (ICO) at ico.org.uk or on 0303 123 1113. We would appreciate the chance to put things right first.</p>' },
      { heading: 'Security', body: '<p>We protect your data with encrypted connections, hashed passwords and access controls limited to staff who need it. No system is completely secure, so please use a strong, unique password for your account.</p>' },
      { heading: 'Changes to this policy', body: '<p>We will update this page if how we use your data changes, and change the date at the top.</p>' },
    ],
  },
  {
    slug: 'cookie-policy',
    title: 'Cookie policy',
    metaDescription: 'The cookies and browser storage we use, why, and how to change your choices.',
    blocks: [
      { body: `<p>Last updated: ${UPDATED}. Like most shops, this website stores small pieces of information in your browser. This page lists what we store, why, and how you can change your choice.</p>` },
      { heading: 'Essential storage', body: '<p>These are needed for the site to work, so they do not require your consent. They stay in your browser and are removed when you sign out or clear your browser data.</p><ul><li><strong>ukcs.auth</strong> - keeps you signed in to your account.</li><li><strong>ukcs.guestToken</strong> - remembers your basket if you shop without an account.</li><li><strong>ukcs.paypalCheckout</strong> (session only) - lets your order complete when you return from the PayPal or card payment page.</li><li><strong>ukcs.consent</strong> - remembers your cookie choice, so we do not ask again on every page.</li></ul>' },
      { heading: 'Features you use', body: '<ul><li><strong>ukcs.compare</strong> - the products you add to a comparison.</li><li><strong>ukcs.recent</strong> - products you have recently viewed, so we can show them to you again.</li></ul><p>Both are kept only in your browser and are used only to provide those features.</p>' },
      { heading: 'Analytics and marketing', body: '<p>Only if you choose <strong>Accept all</strong> in the cookie banner, and only if we have enabled them, we load:</p><ul><li><strong>Google Analytics / Google Tag Manager</strong> - to understand how visitors use the site, using cookies such as _ga.</li><li><strong>Meta Pixel</strong> - to measure the effect of our Facebook and Instagram advertising, using cookies such as _fbp.</li></ul><p>If you choose <strong>Reject non-essential</strong>, none of these are loaded.</p>' },
      { heading: 'Changing your choice', body: '<p>You can change or withdraw your choice at any time using the <strong>Cookie preferences</strong> link at the bottom of every page. You can also clear or block cookies in your browser settings, although parts of the site, such as signing in and your basket, may then stop working.</p><p>Questions? Email {{supportEmail}}.</p>' },
    ],
  },
  {
    slug: 'accessibility',
    title: 'Accessibility statement',
    metaDescription: 'Our commitment to making this website usable by everyone, and how to tell us about a problem.',
    blocks: [
      { body: `<p>Last updated: ${UPDATED}. We want everyone to be able to use this website, including people who use screen readers, keyboard navigation, screen magnifiers or voice control.</p>` },
      { heading: 'Our approach', body: '<p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. The site is built with a skip-to-content link, keyboard-accessible navigation and forms, text alternatives for meaningful images, and colour contrast chosen for readability. We review accessibility as we add and change pages.</p>' },
      { heading: 'Known limitations', body: '<p>Some product images and descriptions come from manufacturers and may not have full text alternatives. Some older content may not yet meet every guideline. We are working to fix these as we find them.</p>' },
      { heading: 'Tell us about a problem', body: '<p>If you find part of the site hard to use, or need information in a different format, please contact us at {{supportEmail}} or on {{supportPhone}}. Tell us the page and the problem, and we will reply as soon as we can and help you complete your order in another way if needed.</p>' },
    ],
  },
];

export async function seedLegalPages(prisma: PrismaClient): Promise<string[]> {
  const notes: string[] = [];
  for (const page of PAGES) {
    const existing = await prisma.page.findUnique({ where: { slug: page.slug }, select: { id: true } });
    if (existing) { notes.push(`Page /pages/${page.slug} already exists; left unchanged.`); continue; }
    await prisma.page.create({
      data: { slug: page.slug, title: page.title, metaTitle: page.title, metaDescription: page.metaDescription, contentBlocks: page.blocks, status: 'DRAFT', isSystemPage: true },
    });
    notes.push(`Created draft page /pages/${page.slug}.`);
  }

  const footer = await prisma.menu.findUnique({ where: { slug: 'footer' }, select: { id: true } });
  if (!footer) return [...notes, 'No footer menu; Legal column not added.'];
  const column = await prisma.menuItem.findFirst({ where: { menuId: footer.id, parentId: null, label: 'Legal' }, select: { id: true } });
  if (column) return [...notes, 'Footer already has a Legal column; left unchanged.'];
  const lastColumn = await prisma.menuItem.findFirst({ where: { menuId: footer.id, parentId: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const legal = await prisma.menuItem.create({ data: { menuId: footer.id, label: 'Legal', sortOrder: (lastColumn?.sortOrder ?? 0) + 1 } });
  for (const [index, page] of PAGES.entries()) {
    // Inactive until the pages are published, so the footer never links to a page that 404s.
    await prisma.menuItem.create({ data: { menuId: footer.id, parentId: legal.id, label: page.title, href: `/pages/${page.slug}`, sortOrder: index + 1, status: 'INACTIVE' } });
  }
  return [...notes, 'Added a Legal footer column (links inactive until the pages are published).'];
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedLegalPages(prisma)
    .then((notes) => notes.forEach((note) => console.log(note)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

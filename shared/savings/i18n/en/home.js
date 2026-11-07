/* The yearly savings, English: the homepage's hero line and its list (#savings). The figures come from
 * shared/savings/data.mjs; {total} and {price} are formatted for the page's language. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'savings.hero.line': '≈ ${total} a year in software you don’t have to buy',
  'savings.hero.how': 'How this figure is counted',
  'savings.list.title': 'Where the number comes from',
  'savings.list.lede': 'An estimate for one user at US list prices, excluding taxes and discounts: the paid subscriptions you would otherwise buy for the same work. A subscription that covers several apps here is counted once, apps with a free equivalent are left out, and the homepage rounds the sum down.',
  'savings.list.open': 'Every subscription, its price and its source',
  'savings.list.col_plan': 'Instead of',
  'savings.list.col_apps': 'Apps here',
  'savings.list.col_price': 'A year',
  'savings.list.col_source': 'Source',
  'savings.list.source': 'Pricing page, checked {date}',
  'savings.list.total': 'Total',
  'savings.list.shown': 'Shown on the homepage, rounded down: {total}',
  'savings.terms.annual_monthly': 'annual plan, billed monthly',
  'savings.terms.yearly': 'paid yearly',
  'savings.terms.billed_yearly': 'billed yearly',
  'savings.terms.user_yearly': 'per user, billed yearly',
  'savings.terms.seat_yearly': 'per seat, billed yearly',
  'savings.terms.lowest_yearly': 'lowest paid plan, billed yearly',
});

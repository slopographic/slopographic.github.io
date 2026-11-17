/* Slop Reports: the built-in reports, each a small JSON query (see engine.js for every key). Read-only: a report
 * never writes. "$today" and "$today+14" in a where value are resolved when the report runs. Classic script: sets
 * window.SlopReports.BUILTIN (frozen). The customers collection is the one Slop Contacts and Slop CRM share. */
(function (g) {
  'use strict';
  const ns = (g.SlopReports = g.SlopReports || {});

  const BUILTIN = [
    { id: 'unpaid-invoices', title: 'Unpaid invoices by customer',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'Issued invoices that are not paid. Balance is the total less payments made, in each invoice currency.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'invoices', where: [['status', '=', 'issued']], enrich: ['invoiceBalance'],
      join: { from: 'customers', on: ['customerId', 'id'], type: 'left', prefix: 'customer_' },
      by: ['customerId', 'customer_name', 'currency'], count: true, sum: ['total', 'balance'],
      orderBy: 'sum_balance', desc: true,
      columns: [
        { field: 'customer_name', label: 'Customer' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'currency', label: 'Currency' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Invoices', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_total', label: 'Total', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_balance', label: 'Balance due', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'contacts-by-group', title: 'Contacts by group',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'A contact in two groups is counted in both. A contact in no group is shown as (no group).',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'customers', unwind: 'groupIds',
      join: { from: 'customerGroups', on: ['groupIds', 'id'], type: 'left', prefix: 'group_' },
      by: ['group_name'], count: true, orderBy: 'count', desc: true,
      columns: [
        { field: 'group_name', label: 'Group' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Contacts', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'crm-by-stage', title: 'CRM leads by stage',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'Value is the issued and paid invoices of each customer, in the base currency.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'customers', enrich: ['customerValue'], by: ['stage'], count: true, sum: ['value'],
      orderBy: 'stage',
      columns: [
        { field: 'stage', label: 'Stage' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Customers', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_value', label: 'Value', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'follow-ups-14', title: 'Follow-ups due in the next 14 days',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'Customers with a follow-up date from today to 14 days ahead. A record with the same email that was imported from Slop Contacts is shown beside it.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'customers', where: [['followUp', '>=', '$today'], ['followUp', '<=', '$today+14']],
      join: { from: 'customers', on: ['email', 'email'], type: 'left', prefix: 'contact_', ci: true, where: [['contactId', 'starts', '']] },
      orderBy: 'followUp',
      columns: [
        { field: 'followUp', label: 'Follow-up', type: 'date' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'name', label: 'Name' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'stage', label: 'Stage' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'email', label: 'Email' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'contact_name', label: 'Contact name' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'contact_phone', label: 'Contact phone' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'profit-by-month', title: 'Profit by month',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'From the ledger: income is what was posted to revenue accounts, expense what was posted to expense accounts (Slop Expenses and any manual entry), in the base currency. A voided invoice or expense cancels itself out.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'journal', enrich: ['profit'], by: ['month'], sum: ['income', 'expense', 'profit'], orderBy: 'month', desc: true,
      columns: [
        { field: 'month', label: 'Month' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_income', label: 'Income', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_expense', label: 'Expenses', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_profit', label: 'Profit', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'cash-flow', title: 'Cash flow by month',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'From the ledger: money that came into cash and the bank (payments received) and went out (expenses paid, supplier bills), in the base currency. Moves between cash and the bank are left out.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'journal', enrich: ['cash'], by: ['month'], count: true, sum: ['cashIn', 'cashOut', 'net'], orderBy: 'month', desc: true,
      columns: [
        { field: 'month', label: 'Month' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_cashIn', label: 'In', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_cashOut', label: 'Out', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_net', label: 'Net', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Entries', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'sales-tax', title: 'Sales tax by quarter',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'From the ledger: the tax charged on issued invoices (collected), the tax on recorded expenses and supplier bills (reclaimed), and the difference to pay, in the base currency. A voided invoice or expense comes off what it added. Check it with your accountant before you file.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'journal', enrich: ['salesTax'], by: ['quarter'], sum: ['collected', 'reclaimed', 'due'], orderBy: 'quarter', desc: true,
      columns: [
        { field: 'quarter', label: 'Quarter' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_collected', label: 'Collected', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_reclaimed', label: 'Reclaimed', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_due', label: 'To pay', type: 'money', currency: 'base' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'expenses-by-category', title: 'Expenses by category',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'Recorded expenses that are not void, by expense account, in each expense currency. Amount includes tax.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'expenses', where: [['status', '=', 'posted']],
      join: { from: 'accounts', on: ['account', 'code'], type: 'left', prefix: 'account_' },
      by: ['account', 'account_name', 'currency'], count: true, sum: ['amount', 'tax'], orderBy: 'sum_amount', desc: true,
      columns: [
        { field: 'account', label: 'Account' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'account_name', label: 'Category' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'currency', label: 'Currency' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Expenses', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_amount', label: 'Amount', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_tax', label: 'Tax', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'spend-by-supplier', title: 'Spend by supplier',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'Recorded expenses that are not void, by supplier, in each currency: purchase order bills from Slop Purchases and every other expense. Amount includes tax.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'expenses', where: [['status', '=', 'posted']],
      by: ['supplier', 'currency'], count: true, sum: ['amount', 'tax'], orderBy: 'sum_amount', desc: true,
      columns: [
        { field: 'supplier', label: 'Supplier' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'currency', label: 'Currency' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Bills', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_amount', label: 'Spent', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_tax', label: 'Tax to reclaim', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'quote-win-rate', title: 'Quotes won by month',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'From Slop Quotes: the quotes written each month, how many were accepted or declined, the win rate of the decided ones, and the value won, in each currency.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'quotes', enrich: ['quoteOutcome'], by: ['month', 'currency'], count: true, sum: ['wins', 'losses', 'wonValue'], avg: ['won'], orderBy: 'month', desc: true,
      columns: [
        { field: 'month', label: 'Month' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'currency', label: 'Currency' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Quotes', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_wins', label: 'Won', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_losses', label: 'Lost', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'avg_won', label: 'Win rate', type: 'percent' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_wonValue', label: 'Value won', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
    { id: 'hours-by-customer', title: 'Hours by customer',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      note: 'From Slop Timesheets: the time logged for each customer (internal time is shown as (none)), and what the billable part is worth at its rates, in each currency.',   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      from: 'timeEntries', enrich: ['timeValue'],
      join: { from: 'customers', on: ['customerId', 'id'], type: 'left', prefix: 'customer_' },
      by: ['customer_name', 'currency'], count: true, sum: ['minutes', 'value'], orderBy: 'sum_minutes', desc: true,
      columns: [
        { field: 'customer_name', label: 'Customer' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'currency', label: 'Currency' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'count', label: 'Entries', type: 'number' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_minutes', label: 'Time', type: 'duration' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
        { field: 'sum_value', label: 'Billable value', type: 'money' },   // i18n-ignore: the built-in definitions in their own (JSON) words; the page shows reports.def.<id>.* (app.js localDef)
      ] },
  ];

  ns.BUILTIN = Object.freeze(BUILTIN.map((r) => Object.freeze(r)));
})(typeof window !== 'undefined' ? window : globalThis);

/* Built-in templates: one data file per template (plain objects: id, name, description, sheets). */
import budget from './budget.js';
import invoice from './invoice.js';
import inventory from './inventory.js';
import timesheet from './timesheet.js';
import projectPlan from './project-plan.js';
import salesPipeline from './sales-pipeline.js';
import expenseClaim from './expense-claim.js';
import gradeBook from './grade-book.js';

export { buildWorkbook } from './build.js';
export const BUILTIN = [budget, invoice, inventory, timesheet, projectPlan, salesPipeline, expenseClaim, gradeBook];
export const builtinById = (id) => BUILTIN.find((t) => t.id === id) || null;

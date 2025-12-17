import { initTRPC } from '@trpc/server';
import { Context } from './context';

/**
 * tRPC Initialization
 * 
 * This file sets up the core tRPC instance that will be used throughout the API.
 * tRPC is a fantastic library that gives you end-to-end typesafety between your
 * API and client without code generation.
 * 
 * Think of this as the foundation that all your API routes will be built on top of.
 * It provides the basic building blocks (procedures) that you'll use to create
 * your API endpoints.
 */

// Initialize tRPC with your context type
// The context contains things that are available to all procedures (like database access)
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * 
 * These are the building blocks you'll use to create your API:
 * - router: Used to group related procedures together
 * - publicProcedure: A procedure that anyone can call (no authentication required)
 * 
 * In a production app, you'd also have protectedProcedure which requires authentication,
 * but for simplicity, this example uses only public procedures.
 */
export const router = t.router;
export const publicProcedure = t.procedure;
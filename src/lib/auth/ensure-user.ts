import { currentUser } from '@clerk/nextjs/server';
import { createPureClient } from '@/lib/supabase/server';

/**
 * Ensures that the Clerk user exists in Supabase
 * If not, creates a new user record
 *
 * This function should be called at the start of protected API routes
 * to handle cases where webhook synchronization didn't occur
 */
export async function ensureUserInDatabase(clerkId: string) {
  const supabase = await createPureClient();

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', clerkId)
    .single();

  if (existingUser) {
    return; // User already exists
  }

  // User doesn't exist, fetch from Clerk and create
  console.log(`[ensureUserInDatabase] User not found, creating: ${clerkId}`);

  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error('Clerk user not found');
  }

  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId
  );

  if (!primaryEmail) {
    throw new Error('No primary email found for user');
  }

  // Create user in Supabase
  const { error } = await supabase.from('users').insert({
    id: clerkUser.id,
    email: primaryEmail.emailAddress,
    name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || null,
    plan: 'free',
    tests_remaining: 3,
  });

  if (error) {
    console.error('[ensureUserInDatabase] Error creating user:', error);
    throw error;
  }

  console.log(`[ensureUserInDatabase] ✅ User created: ${primaryEmail.emailAddress} (${clerkUser.id})`);
}

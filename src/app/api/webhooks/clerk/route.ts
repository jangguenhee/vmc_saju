import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createPureClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // Get the Clerk webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add CLERK_WEBHOOK_SECRET to .env.local");
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Error occurred -- missing svix headers", {
      status: 400,
    });
  }

  // Get the body as text (important for signature verification)
  const payload = await req.text();

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new NextResponse("Error occurred -- verification failed", {
      status: 400,
    });
  }

  // Handle the webhook event
  const eventType = evt.type;
  console.log(`[Clerk Webhook] Received event: ${eventType}`);

  const supabase = await createPureClient();

  try {
    switch (eventType) {
      case "user.created": {
        const { id, email_addresses, first_name, last_name } = evt.data;

        // Get primary email
        const primaryEmail = email_addresses.find(
          (email) => email.id === evt.data.primary_email_address_id
        );

        if (!primaryEmail) {
          console.error("[Clerk Webhook] No primary email found for user:", id);
          return new NextResponse("Error occurred -- no primary email", {
            status: 400,
          });
        }

        // Create user in Supabase
        const { error } = await supabase.from("users").insert({
          id, // Clerk user ID (TEXT type)
          email: primaryEmail.email_address,
          name: `${first_name || ""} ${last_name || ""}`.trim() || null,
          plan: "free",
          tests_remaining: 3,
        });

        if (error) {
          console.error("[Clerk Webhook] Error creating user:", error);
          return new NextResponse("Error occurred -- database insert failed", {
            status: 500,
          });
        }

        console.log(`[Clerk Webhook] ✅ User created: ${primaryEmail.email_address} (${id})`);
        break;
      }

      case "user.updated": {
        const { id, email_addresses, first_name, last_name } = evt.data;

        // Get primary email
        const primaryEmail = email_addresses.find(
          (email) => email.id === evt.data.primary_email_address_id
        );

        if (!primaryEmail) {
          console.error("[Clerk Webhook] No primary email found for user update:", id);
          return new NextResponse("Error occurred -- no primary email", {
            status: 400,
          });
        }

        // Update user in Supabase
        const { error } = await supabase
          .from("users")
          .update({
            email: primaryEmail.email_address,
            name: `${first_name || ""} ${last_name || ""}`.trim() || null,
          })
          .eq("id", id);

        if (error) {
          console.error("[Clerk Webhook] Error updating user:", error);
          return new NextResponse("Error occurred -- database update failed", {
            status: 500,
          });
        }

        console.log(`[Clerk Webhook] ✅ User updated: ${primaryEmail.email_address} (${id})`);
        break;
      }

      case "user.deleted": {
        const { id } = evt.data;

        if (!id) {
          console.error("[Clerk Webhook] No user ID found for deletion");
          return new NextResponse("Error occurred -- no user ID", {
            status: 400,
          });
        }

        // Delete user from Supabase (CASCADE will delete related records)
        const { error } = await supabase.from("users").delete().eq("id", id);

        if (error) {
          console.error("[Clerk Webhook] Error deleting user:", error);
          return new NextResponse("Error occurred -- database delete failed", {
            status: 500,
          });
        }

        console.log(`[Clerk Webhook] ✅ User deleted: ${id}`);
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${eventType}`);
    }

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("[Clerk Webhook] Error processing webhook:", error);
    return new NextResponse("Error occurred -- processing failed", {
      status: 500,
    });
  }
}

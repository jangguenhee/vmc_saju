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

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
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

  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data;

    // Get primary email
    const primaryEmail = email_addresses.find(
      (email) => email.id === evt.data.primary_email_address_id
    );

    if (!primaryEmail) {
      console.error("No primary email found for user:", id);
      return new NextResponse("Error occurred -- no primary email", {
        status: 400,
      });
    }

    try {
      // Create user in Supabase
      const supabase = await createPureClient();

      const { error } = await supabase.from("users").insert({
        id, // Clerk user ID (TEXT type)
        email: primaryEmail.email_address,
        name: `${first_name || ""} ${last_name || ""}`.trim() || null,
        plan: "free",
        tests_remaining: 3,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Error creating user in Supabase:", error);
        return new NextResponse("Error occurred -- database insert failed", {
          status: 500,
        });
      }

      console.log("User synced to Supabase:", id);
    } catch (error) {
      console.error("Error syncing user to Supabase:", error);
      return new NextResponse("Error occurred -- sync failed", {
        status: 500,
      });
    }
  }

  return new NextResponse("Webhook processed successfully", { status: 200 });
}

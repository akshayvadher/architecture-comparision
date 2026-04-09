CREATE TABLE "transfer_read_model" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"status" text NOT NULL
);

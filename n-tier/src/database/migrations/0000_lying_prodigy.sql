CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL
);

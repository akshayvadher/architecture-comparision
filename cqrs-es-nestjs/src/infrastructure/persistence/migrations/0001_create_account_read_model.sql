CREATE TABLE "account_read_model" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"balance" numeric NOT NULL,
	"status" text NOT NULL
);

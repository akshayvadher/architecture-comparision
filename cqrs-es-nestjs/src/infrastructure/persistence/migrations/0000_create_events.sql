CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"version" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_version_unique" UNIQUE("aggregate_id","version")
);

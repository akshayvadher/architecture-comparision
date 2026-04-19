CREATE TABLE "snapshots" (
	"aggregate_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_aggregate_id_aggregate_type_pk" PRIMARY KEY("aggregate_id","aggregate_type")
);

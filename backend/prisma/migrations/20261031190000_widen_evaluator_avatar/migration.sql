ALTER TABLE "Evaluator" DROP CONSTRAINT "Evaluator_avatar_check";

ALTER TABLE "Evaluator"
ADD CONSTRAINT "Evaluator_avatar_check" CHECK ("avatar" BETWEEN 0 AND 39);

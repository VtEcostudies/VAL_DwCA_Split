/*
Importing/Exporting with Postgres copy can cause problems for downstream data-ingestion:
- on Import, by default it adds double-quotes to NULL TEXT fields (use FORCENULL to avoid this)
  which cannot be easily fixed on export (FORCENULL does not work on export).
*/
BEGIN TRANSACTION;
SET client_encoding TO 'UTF8';
copy (
	select * from occurrence_filtered
)  
TO 'C:/Users/jloomis/Documents/VCE/VAL_Data_Pipelines/VAL_DWcA_Split/filtered_both/occurrence.txt'
WITH DELIMITER E'\t' HEADER CSV;
--WITH DELIMITER E'\t' QUOTE '"' HEADER CSV;
--WITH DELIMITER E'\t'; -- 'TEXT' mode exports NULLs as \N
--WITH HEADER CSV; -- 'CSV' mode exports all fields in double-quotes
END TRANSACTION;
--psql command
--\copy occurrence_filtered TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence.txt' CSV DELIMITER E'\t' HEADER;
	
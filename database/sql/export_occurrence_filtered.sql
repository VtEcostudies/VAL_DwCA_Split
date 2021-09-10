SET client_encoding TO 'UTF8';
copy (
	select * from occurrence_filtered
)  
TO'C:/Users/jloomis/Documents/VCE/VAL_Data_Pipelines/VAL_DWcA_Split/filtered/occurrence.txt'
WITH DELIMITER E'\t' QUOTE '"' HEADER CSV;

--with NULL '' DELIMITER E'\t' QUOTE '"' FORCE QUOTE * HEADER CSV;

--psql command
--\copy occurrence_filtered TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence.txt' CSV DELIMITER E'\t' HEADER;
	
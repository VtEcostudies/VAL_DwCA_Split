BEGIN TRANSACTION;
SET client_encoding TO 'UTF8';
copy (
	select * from verbatim_filtered
)
TO 'C:/Users/jloomis/Documents/VCE/VAL_Data_Pipelines/VAL_DWcA_Split/filtered_both/verbatim.txt'
WITH DELIMITER E'\t' HEADER CSV;
END TRANSACTION;
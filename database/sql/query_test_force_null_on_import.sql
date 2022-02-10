DROP TABLE IF EXISTS occ_test;
CREATE TABLE occ_test AS SELECT * FROM occurrence_buffered limit 0;

copy occ_test
	FROM 'C:/Users/jloomis/Documents/VCE/VAL_Data_Pipelines/VAL_DWcA_Split/filtered_both/occurrence.txt'
	WITH (HEADER, FORMAT CSV, DELIMITER E'\t', 
	  FORCE_NULL('accessRights','bibliographicCitation','language','rightsHolder','source','type','institutionID','datasetID')
	);
	
SELECT * FROM occ_test limit 100;
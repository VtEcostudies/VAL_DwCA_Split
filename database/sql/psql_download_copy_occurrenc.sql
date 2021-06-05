--do table copy so we can drop extra columns before download
DROP TABLE if exists occ_download;
CREATE TABLE occ_download AS SELECT * FROM occurrence;
ALTER TABLE occ_download DROP COLUMN "OBJECTID";
ALTER TABLE occ_download DROP COLUMN "point";
ALTER TABLE occ_download DROP COLUMN "geometry";

--if pgAdmin and the server reside on the same machine, you can use:
copy (select * from occ_download)
to 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence.csv' 
delimiter E'\t' csv header;

-- If your are connecting to a remote database and wish to copy/download to a local machine, you must use psql and \copy
-- These commands only work in psql. 
-- On Windows, you must use the SQL Shell (psql), found by searching the windows start menu for psql.
-- By default on Windows, the \copy command will produce an error:
-- ERROR:  character with byte sequence 0xc2 0x81 in encoding "UTF8" has no equivalent in encoding "WIN1252"
-- This is due to Windows default character encoding different from Linux Potgres server default character encoding
SHOW server_encoding; --UTF8
SHOW client_encoding; --WIN1252
SET client_encoding TO 'UTF8';

--TEST
\copy (select * from occ_download limit 100) TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence_test.csv' CSV DELIMITER ',' HEADER
\copy (select * from occ_download limit 100) TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence_test.txt' CSV DELIMITER E'\t' HEADER
--CSV:
\copy occ_download TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence.csv' CSV DELIMITER ',' HEADER
--TXT:
\copy occ_download TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occurrence.txt' CSV DELIMITER E'\t' HEADER

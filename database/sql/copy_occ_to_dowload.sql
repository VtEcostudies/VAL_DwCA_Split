DROP TABLE if exists occ_download;
CREATE TABLE occ_download AS SELECT * FROM occurrence;
ALTER TABLE occ_download DROP COLUMN "OBJECTID";
ALTER TABLE occ_download DROP COLUMN "point";
ALTER TABLE occ_download DROP COLUMN "geometry";

--select column_name from information_schema.columns where table_name = 'occ_download' order by ordinal_position;
--\copy (select column_name from information_schema.columns where table_name = 'occ_download' order by ordinal_position) TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\occ_columns.csv' CSV DELIMITER ',' HEADER
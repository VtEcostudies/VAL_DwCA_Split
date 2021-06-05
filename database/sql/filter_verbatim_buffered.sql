select count(*) from verbatim_buffered; --5795868 (on 2021-06-04)

drop table if exists verbatim_filtered;

select verbatim_buffered.* 
into verbatim_filtered
from verbatim_buffered
inner join vt_boundary_river_lake on 
	ST_WITHIN(
		ST_GEOMFROMTEXT('POINT(' || "decimalLongitude" || ' ' ||  "decimalLatitude" || ')', 4326),
		vt_boundary_river_lake.geometry
	)
--limit 10
; --SELECT 5328453 (on 2021-06-04)

SHOW server_encoding; --UTF8
SHOW client_encoding; --WIN1252
SET client_encoding TO 'UTF8';

\copy verbatim_filtered TO 'C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\filtered\verbatim.txt' CSV DELIMITER E'\t' HEADER;

	
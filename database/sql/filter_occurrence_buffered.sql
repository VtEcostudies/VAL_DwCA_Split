--select count(*) from occurrence_buffered;
--drop table if exists occurrence_filtered;
/*
NOTE: for R to load this file and use it, we cannot have more than one SQL statement.
*/
select occurrence_buffered.* 
into occurrence_filtered
from occurrence_buffered
inner join vt_boundary_river_lake on 
	ST_WITHIN(
		ST_GEOMFROMTEXT('POINT(' || "decimalLongitude" || ' ' ||  "decimalLatitude" || ')', 4326),
		vt_boundary_river_lake.geometry
	);
--SELECT COUNT("gbifID") FROM occurrence_filtered; --loc:7645807 noloc:7851097
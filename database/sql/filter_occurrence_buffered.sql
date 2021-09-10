--select count(*) from occurrence_buffered;

drop table if exists occurrence_filtered;

select occurrence_buffered.* 
into occurrence_filtered
from occurrence_buffered
inner join vt_boundary_river_lake on 
	ST_WITHIN(
		ST_GEOMFROMTEXT('POINT(' || "decimalLongitude" || ' ' ||  "decimalLatitude" || ')', 4326),
		vt_boundary_river_lake.geometry
	);

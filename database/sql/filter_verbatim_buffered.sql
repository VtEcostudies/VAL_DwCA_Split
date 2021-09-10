select verbatim_buffered.* 
into verbatim_filtered
from verbatim_buffered
inner join vt_boundary_river_lake on 
	ST_WITHIN(
		ST_GEOMFROMTEXT('POINT(' || "decimalLongitude" || ' ' ||  "decimalLatitude" || ')', 4326),
		vt_boundary_river_lake.geometry
	);

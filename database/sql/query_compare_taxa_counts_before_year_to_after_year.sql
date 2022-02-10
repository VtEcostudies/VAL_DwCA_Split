drop table if exists before_occs; drop table if exists after_occs;
select "scientificName","gbifID","eventDate" into before_occs from occurrence_filtered 
where "eventDate" < '1980'
and "kingdom"='Animalia'
--and "class"='Aves'
;
select "scientificName","gbifID","eventDate" into after_occs from occurrence_filtered 
where "eventDate" > '1980'
and "kingdom"='Animalia'
--and "class"='Aves'
;
select count(*) from occurrence_filtered where "kingdom" is null or "kingdom" = '';

--occurrences before 'year'
select count(*) from before_occs; --2000:438,573,   1980:306,000
--occurrences after 'year'
select count(*) from after_occs;  --2000:6,191,416, 1980:6,323,929

--distinct taxa found before 'year' not found after 'year'
select count(distinct before_occs."scientificName") from before_occs --2000:11,432, 1980:10,125
left join after_occs on after_occs."scientificName" = before_occs."scientificName"
where after_occs."scientificName" is null;

-- distinct taxa found after 'year' not found before 'year'
select count(distinct after_occs."scientificName") from after_occs --2000:4,808, 1980:5,771
left join before_occs on before_occs."scientificName" = after_occs."scientificName"
where before_occs."scientificName" is null;
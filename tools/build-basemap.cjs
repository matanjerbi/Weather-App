// Builds the offline basemap (land + borders) from Natural Earth via world-atlas.
// usage: node tools/build-basemap.cjs <world-atlas dir> <topojson-client dir> <out.json>
const [, , WA, TC, OUT] = process.argv;
const topo = require(TC);
const fs = require('fs');
const w50 = require(WA + '/countries-50m.json');
const w10 = require(WA + '/countries-10m.json');
const REGION = /^(Israel|Palestine|Jordan|Lebanon|Syria|Egypt|Cyprus|N\. Cyprus|Cyprus U\.N\. Buffer Zone|Turkey|Greece|Iraq|Saudi Arabia)$/;
const inR = (g) => REGION.test(g.properties.name);
const round = (d) => (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(d), +c[1].toFixed(d)] : c.map(round(d)));
const pack = (geom, d) => ({ type: geom.type, coordinates: round(d)(geom.coordinates) });

const worldLand = topo.merge(w50, w50.objects.countries.geometries.filter(g => !inR(g)));
const regionLand = topo.merge(w10, w10.objects.countries.geometries.filter(inR));
const worldLines = topo.mesh(w50, w50.objects.countries, (a, b) => !(inR(a) || inR(b)));
const regionLines = topo.mesh(w10, { type: 'GeometryCollection', geometries: w10.objects.countries.geometries.filter(inR) });
const out = {
  land: [pack(worldLand, 2), pack(regionLand, 3)],
  lines: [pack(worldLines, 2), pack(regionLines, 3)],
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('bytes', fs.statSync(OUT).size);

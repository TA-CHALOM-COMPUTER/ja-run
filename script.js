const map = L.map('map').setView([13.5475,100.2744], 13);

L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
maxZoom:19
}
).addTo(map);

let watchId = null;
let route = [];
let distance = 0;
let startTime = null;
let timerInterval = null;

const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");
const paceEl = document.getElementById("pace");

let polyline = L.polyline([], {
color: "#ff5a1f",
weight: 5
}).addTo(map);

document
.getElementById("startBtn")
.addEventListener("click", startRun);

document
.getElementById("stopBtn")
.addEventListener("click", stopRun);

document
.getElementById("saveBtn")
.addEventListener("click", saveRun);

function startRun(){

route = [];
distance = 0;

distanceEl.textContent = "0.00";

startTime = Date.now();

timerInterval = setInterval(updateTimer,1000);

watchId = navigator.geolocation.watchPosition(

position => {

const lat = position.coords.latitude;
const lng = position.coords.longitude;

const point = [lat,lng];

route.push(point);

map.setView(point,16);

polyline.setLatLngs(route);

if(route.length > 1){

distance += calculateDistance(
route[route.length-2],
route[route.length-1]
);

distanceEl.textContent =
distance.toFixed(2);

updatePace();
}

},

error => {
alert("ไม่สามารถเข้าถึง GPS");
},

{
enableHighAccuracy:true
}

);

}

function stopRun(){

navigator.geolocation.clearWatch(watchId);

clearInterval(timerInterval);

}

function updateTimer(){

const elapsed =
Math.floor((Date.now()-startTime)/1000);

const min =
String(Math.floor(elapsed/60))
.padStart(2,"0");

const sec =
String(elapsed%60)
.padStart(2,"0");

durationEl.textContent =
`${min}:${sec}`;

}

function updatePace(){

const minutes =
(Date.now()-startTime)/60000;

if(distance > 0){

const pace =
(minutes/distance).toFixed(2);

paceEl.textContent = pace;

}

}

function calculateDistance(a,b){

const R = 6371;

const dLat =
(b[0]-a[0]) * Math.PI/180;

const dLon =
(b[1]-a[1]) * Math.PI/180;

const lat1 =
a[0] * Math.PI/180;

const lat2 =
b[0] * Math.PI/180;

const x =
Math.sin(dLat/2)**2 +
Math.sin(dLon/2)**2 *
Math.cos(lat1) *
Math.cos(lat2);

const c =
2 * Math.atan2(
Math.sqrt(x),
Math.sqrt(1-x)
);

return R*c;

}

function saveRun(){

const run = {

date:new Date().toLocaleString("th-TH"),

distance:distance.toFixed(2),

duration:durationEl.textContent,

pace:paceEl.textContent

};

let runs =
JSON.parse(
localStorage.getItem("jarun")
) || [];

runs.unshift(run);

localStorage.setItem(
"jarun",
JSON.stringify(runs)
);

loadHistory();

alert("บันทึกสำเร็จ");

}

function loadHistory(){

const history =
JSON.parse(
localStorage.getItem("jarun")
) || [];

const container =
document.getElementById("historyList");

container.innerHTML = "";

history.forEach(run=>{

container.innerHTML += `

<div class="run-card">

<strong>${run.date}</strong>

<p>🏃 ${run.distance} กม.</p>

<p>⏱ ${run.duration}</p>

<p>⚡ Pace ${run.pace}</p>

</div>

`;

});

}

loadHistory();
ZONES = ["Downtown Cairo", "Nasr City", "New Cairo", "Heliopolis", "Maadi", "Giza", "Dokki", "6th of October", "Zamalek", "Mokattam"]
_times = [
 [0,30,45,25,35,35,25,55,15,35], [30,0,35,20,40,45,35,65,35,25],
 [45,35,0,35,55,60,50,75,50,45], [25,20,35,0,40,40,30,60,30,30],
 [35,40,55,40,0,40,35,55,35,25], [35,45,60,40,40,0,20,45,35,45],
 [25,35,50,30,35,20,0,40,25,35], [55,65,75,60,55,45,40,0,55,65],
 [15,35,50,30,35,35,25,55,0,35], [35,25,45,30,25,45,35,65,35,0],
]
DISTANCE = {a: {b: _times[i][j] for j, b in enumerate(ZONES)} for i, a in enumerate(ZONES)}

def estimate_route(from_zone: str, to_zone: str) -> int:
    if from_zone not in DISTANCE or to_zone not in DISTANCE:
        return 35
    return DISTANCE[from_zone][to_zone]

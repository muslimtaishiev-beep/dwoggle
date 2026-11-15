# Data and resources used by Dwoggle

Dwoggle checks a place in Kyrgyzstan against about 25 years of open satellite data and shows five risk signals:
flood, landslide, earthquake, heat and green. This page lists what it uses, so every number in the app can be
traced to its source. The full rules for each grade are served by the backend at `/api/methodology`.

## NASA data and resources from the challenge list

| Resource | Used | How Dwoggle uses it |
| --- | --- | --- |
| **Giovanni** | Yes | The Giovanni Time Series API gives daily rainfall (GPM IMERG Final Daily V07, ~11 km) at the checked point. It adds context to the flood signal. |
| **Hydrology Time Series** | Yes | The same Giovanni service gives monthly runoff and soil moisture from GLDAS Noah 2.1 (~28 km). It is the service that replaced Data Rods. It is used as context for flood. |
| **AppEEARS** | Yes | A second opinion. Dwoggle sends the area to NASA's own AppEEARS tool and recalculates the heat (MODIS MOD11A2) and green (MODIS MOD13Q1) trends there, to check its own sums. It also reads the MODIS MOD44W yearly land/water mask (250 m) as a second look at past water. |
| **Climate Data Online (CDO)** | Yes | NOAA NCEI GHCN weather stations (Global Summary of the Month). The nearest long-record station within 30 km at a similar height is compared with the satellite heat trend. |
| Time-Series Analysis of Remotely-Sensed SeaWiFS Chlorophyll | No | Not used directly. Dwoggle's own trend method is described below. |

## Space agency partner resources from the challenge list

| Resource | Used |
| --- | --- |
| KNMI Climate Explorer | No |
| Statistical test methods to detect trends in time series data | No (not used directly) |
| A Comprehensive Guide to Statistical Significance | No (not used directly) |
| CSA RADARSAT Constellation Mission (RCM) data | No |
| Geo.ca | No |
| SWOT mission | No |
| Monitoring and protecting our ecosystem from space (CSA) | No |
| Synthetic Aperture Radar Python tutorial | No |

## Other NASA data behind the risk signals

| Data | Resolution | Signal |
| --- | --- | --- |
| NASA/USGS **Landsat**: water history from JRC Global Surface Water v1.4 (2000–2021, Pekel et al. 2016), and Landsat 8–9 Collection 2 processed by Dwoggle (2022 onward) | 30 m | Flood: in how many years water stood near the point |
| **NASADEM** elevation (NASA JPL) | 30 m | Flood (low ground) and landslide (slope) |
| **MODIS MOD11A2 v061** land surface temperature | 1 km | Heat: how hot the ground gets in summer, and the trend |
| **MODIS MOD13Q1 v061** vegetation index (NDVI) | 250 m | Green: how much plant life there is, and the trend |
| **GPM IMERG** daily rainfall (through Giovanni) | ~11 km | Flood context |
| **GLDAS Noah 2.1** runoff and soil moisture (through Giovanni) | ~28 km | Flood context |
| NASA Global Landslide Susceptibility Map (Stanley and Kirschbaum 2017) | 1 km | Supported, but not switched on in the live app: landslide uses NASADEM slope |

Landsat, NASADEM and MODIS are read and averaged over the checked circle with Google Earth Engine.

## Other open data

| Data | Used for |
| --- | --- |
| GEM Global Active Faults Database (Styron and Pagani 2020, CC BY-SA 4.0) | Earthquake: distance to the nearest active fault. This is not NASA data, and the app says so. |
| NOAA NCEI GHCN stations (Climate Data Online) | The station comparison for heat (see above) |
| OpenStreetMap, via Nominatim and OpenFreeMap | Place names, address search, buildings on the map |
| Esri World Imagery (Esri, Maxar, Earthstar Geographics) | The satellite picture on the map and in the PDF report |
| Mapzen terrain tiles (AWS Open Data), built largely from NASA SRTM | The 3D relief of the map |

## How trends and grades are worked out

- **Trend:** Sen's slope over the yearly values.
- **Significance:** the Mann-Kendall test, with p < 0.05. A change counts only when it is clear and not chance.
- The grades (A to D) follow fixed thresholds per signal. The second opinions (AppEEARS, the weather station, MODIS
  MOD44W) and the Giovanni context are shown beside a grade but never change it.

## AI in the app

The chat's answers to a visitor's own questions are written by Claude (Anthropic), only from the checked place's
report. Dwoggle's voice is made by ElevenLabs. The app says this at the bottom of the chat: AI can make mistakes.
The grades, the reports and the PDF are not made by AI.

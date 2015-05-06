// Sample map plotter.  Just draws an SVG of the route on a grid.

function doPlot() {
    var data = hakadal; // JSON data
    var rs = data.readings;
    var lat_min = Number.POSITIVE_INFINITY;
    var lat_max = Number.NEGATIVE_INFINITY;
    var lon_min = Number.POSITIVE_INFINITY;
    var lon_max = Number.NEGATIVE_INFINITY;
    for ( var i=0 ; i < rs.length ; i++ ) {
        var r = rs[i];
        lat_min = Math.min(lat_min, r[0]);
        lat_max = Math.max(lat_max, r[0]);
        lon_min = Math.min(lon_min, r[1]);
        lon_max = Math.max(lon_max, r[1]);
    }
    var lon_range = lon_max - lon_min;
    var lat_range = lat_max - lat_min;
    var width = 600;
    var height = 600;

    // Scale for non-square drawing surface first.
    var scale_lat = Math.min(1, width/height);
    var scale_lon = Math.min(1, height/width);

    // Scale for position on the earth second.
    //
    // The unit of measurement is a unit length along the y axis
    // (along the longitude), this value is everywhere the same.
    //
    // So the x measurements have to be scaled by the factor x_unit /
    // y_unit, where x_unit is a unit length along the x axis, at a
    // given latitude.

    var unit_y = distanceBetween(0, 0, 1, 0);
    var unit_x = distanceBetween(lat_min, Math.floor(lon_min), lat_min, Math.floor(lon_min)+1);

    scale_lon *= unit_x / unit_y;

    /*
    // Old code - don't need this now?
    if (lat_range > lon_range)
        scale_lon *= lon_range / lat_range;
    else
        scale_lat *= lat_range / lon_range;
    */

    var poly = "";
    for ( var i=0 ; i < rs.length ; i++ ) {
        var r = rs[i];
        if (poly != "")
            poly += ", ";
        var lon = Math.round((r[1] - lon_min) / lon_range * width * scale_lon);
        var lat = height - Math.round((r[0] - lat_min) / lat_range * height * scale_lat);
        poly += lon + " " + lat;
    }

    var svg = '<svg width="' + width + '" + height="' + height + '"><polyline points="' + poly + '" fill="transparent" stroke="green"/></svg>';
    document.getElementById("here").innerHTML = svg;
}

const earth_avg_radius = 6371009.0;	// meters

function distanceBetween(lat_a, lon_a, lat_b, lon_b) {
    lat_a = (lat_a / 180) * Math.PI;
    lon_a = (lon_a / 180) * Math.PI;
    lat_b = (lat_b / 180) * Math.PI;
    lon_b = (lon_b / 180) * Math.PI;
    var delta_lon = Math.abs(lon_a - lon_b);
    var central_angle = Math.acos(Math.sin(lat_a) * Math.sin(lat_b) + Math.cos(lat_a) * Math.cos(lat_b) * Math.cos(delta_lon));
    return earth_avg_radius * central_angle;
}

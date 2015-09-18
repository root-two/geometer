# Geometer
```js
var geometer = createGeometer(db, {precision: 41, geo: true})
// if hashing lat/lon tuples, use an odd precision in order to compensate for lon spanning twice the distance of lat.
//41 bits ~20m2 hashes
```

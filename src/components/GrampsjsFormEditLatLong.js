/*
Form for editing a location's geographic coordinates
*/

import {html, css} from 'lit'

import './GrampsjsMap.js'
import './GrampsjsFormSelectDate.js'
import './GrampsjsFormSelectObjectList.js'

import {GrampsjsObjectForm} from './GrampsjsObjectForm.js'
import {
  GrampsjsNominatimSearchMixin,
  nominatimSearchStyles,
} from '../mixins/GrampsjsNominatimSearchMixin.js'

class GrampsjsFormEditLatLong extends GrampsjsNominatimSearchMixin(
  GrampsjsObjectForm
) {
  static get styles() {
    return [
      super.styles,
      nominatimSearchStyles,
      css`
        md-dialog {
          min-width: 80vw;
        }

        /* Latitude/Longitude side by side, stacking to one column on narrow
           screens (replaces a non-collapsing float layout). */
        .latlong-row {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }

        .latlong-row > div {
          flex: 1 1 200px;
        }
      `,
    ]
  }

  renderForm() {
    return html`
      <div class="latlong-row">
        <div>
          <grampsjs-form-string
            @formdata:changed="${this._handleFormData}"
            fullwidth
            id="lat"
            value="${this.data.lat || ''}"
            label="${this._('Latitude')}"
          ></grampsjs-form-string>
        </div>
        <div>
          <grampsjs-form-string
            fullwidth
            @formdata:changed="${this._handleFormData}"
            id="long"
            value="${this.data.long || ''}"
            label="${this._('Longitude')}"
          ></grampsjs-form-string>
        </div>
      </div>
      <div style="height: 20px;"></div>
      ${this._renderSearchBox()} ${this._renderSearchResults()}
      <p
        style="color:var(--grampsjs-body-font-color-40);font-size:0.9em;margin-bottom:0.25em;"
      >
        ${this._('Select a point on the map')}
      </p>
      <p>
        <grampsjs-map
          .appState="${this.appState}"
          latitude="${this.data.lat ? parseFloat(this.data.lat) : 0}"
          longitude="${this.data.long ? parseFloat(this.data.long) : 0}"
          mapid="edit-latlong-map"
          id="map"
          @mapclick="${this._handleMapClick}"
        >
          ${this.data.lat && this.data.long
            ? html`
                <grampsjs-map-marker
                  latitude="${parseFloat(this.data.lat)}"
                  longitude="${parseFloat(this.data.long)}"
                >
                </grampsjs-map-marker>
              `
            : ''}
        </grampsjs-map>
      </p>
    `
  }

  _handleResClick(res) {
    const lat = parseFloat(res.lat)
    const lon = parseFloat(res.lon)
    if (Number.isNaN(lat) || Number.isNaN(lon)) return
    this._setLatLong(lat, lon)
    const map = this.shadowRoot.querySelector('grampsjs-map')
    if (map !== null) {
      map.jumpTo(lat, lon, map._map?.getZoom() ?? map.zoom)
    }
  }

  _handleMapClick(e) {
    const {lngLat} = e.detail
    if (lngLat?.lat !== undefined && lngLat?.lng !== undefined) {
      this._setLatLong(lngLat.lat, lngLat.lng)
    }
  }

  _setLatLong(lat, long) {
    this.data = {lat: `${lat}`, long: `${long}`}
  }

  reset() {
    this.shadowRoot
      .querySelectorAll('grampsjs-form-string')
      .forEach(element => element.reset())
  }
}

window.customElements.define(
  'grampsjs-form-edit-lat-long',
  GrampsjsFormEditLatLong
)

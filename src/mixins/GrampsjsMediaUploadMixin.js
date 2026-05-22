// Adds the two-step "create a new media object from a file" routine
// (POST the raw file, then PUT its metadata) so forms that upload media
// share a single implementation. Requires `this.appState`.
export const GrampsjsMediaUploadMixin = superClass =>
  class extends superClass {
    async uploadMediaFile(file, metadata = {}) {
      let finalData = {...metadata}
      let res = await this.appState.apiPost('/api/media/', file, {
        isJson: false,
        dbChanged: false,
      })
      if ('data' in res) {
        finalData = {...res.data[0].new, ...finalData}
      } else if ('error' in res) {
        return {error: res.error}
      }
      res = await this.appState.apiPut(
        `/api/media/${finalData.handle}`,
        finalData,
        {dbChanged: false}
      )
      if ('error' in res) {
        return {error: res.error}
      }
      return {data: finalData}
    }
  }

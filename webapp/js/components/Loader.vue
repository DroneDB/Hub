<template>
  <div>
    <div id="loader-backdrop"></div>
    <div id="loader-container">
      <div class="loader">Loading...</div>
    </div>
  </div>
</template>

<script>

export default {
  components: {

  },
  props: {

  },

  data: function () {
    return {};
  },
  mounted: function () {
  },
  methods: {

  }
}
</script>

<style scoped>
#loader-container {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

#loader-backdrop {
  background: rgba(var(--ddb-text-rgb, 100, 100, 100), 0.2);
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 999;
}

.loader,
.loader:after {
  border-radius: 50%;
  width: 10rem;
  height: 10rem;
}

.loader {
  margin: var(--ddb-spacing-2xl) auto;
  font-size: var(--ddb-font-size-sm);
  position: relative;
  text-indent: -9999rem;
  border-top: 1.25rem solid rgba(255, 255, 255, 0.2);
  border-right: 1.25rem solid rgba(255, 255, 255, 0.2);
  border-bottom: 1.25rem solid rgba(255, 255, 255, 0.2);
  border-left: 1.25rem solid var(--ddb-primary);
  -webkit-transform: translateZ(0);
  -ms-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-animation: load8 1.1s infinite linear;
  animation: load8 1.1s infinite linear;
}

@-webkit-keyframes load8 {
  0% {
    -webkit-transform: rotate(0deg);
    transform: rotate(0deg);
  }

  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}

@keyframes load8 {
  0% {
    -webkit-transform: rotate(0deg);
    transform: rotate(0deg);
  }

  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
</style>

import * as THREE from 'three';
import { positionProvider } from './position-provider';
import { NavigationArrow } from './arrow';
import { findShortestPath, getDistance } from './navigation';
import { StoreData } from './store-loader';

declare const XR8: any;
declare const window: any;

export const initScenePipelineModule = (storeData: StoreData | null) => {
  let navArrow: NavigationArrow | null = null;
  const clock = new THREE.Clock();

  let currentPath: string[] = [];
  let currentWaypointIndex = 0;
  let isArrived = false;

  const initXrScene = ({ scene, camera, renderer }: any) => {
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    navArrow = new NavigationArrow(scene, { color: '#AD50FF', animation: 'bounce' });

    if (storeData) {
      const targetId = window.navTargetId || 'W5';
      const path = findShortestPath(storeData.waypoints, storeData.edges, 'W1', targetId);
      if (path) {
        currentPath = path;
        currentWaypointIndex = 1;
      }
    }

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.receiveShadow = true;
    scene.add(plane);

    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    originMarker.position.set(0, 0.05, 0);
    scene.add(originMarker);

    camera.position.set(0, 1.6, 0);
  };

  return {
    name: 'scene-init',

    onStart: ({ canvas }: any) => {
      const { scene, camera, renderer } = XR8.Threejs.xrScene();
      initXrScene({ scene, camera, renderer });

      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());

      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      canvas.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          XR8.XrController.recenter();
        }
      }, true);
    },

    onUpdate: () => {
      if (typeof XR8 === 'undefined') return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera) return;

      positionProvider.updateFromSlam(camera.position, camera.quaternion);

      // Update target if user picked a new destination dynamically
      if (storeData && window.navTargetId && currentPath.length > 0 && currentPath[currentPath.length - 1] !== window.navTargetId) {
        const newPath = findShortestPath(storeData.waypoints, storeData.edges, 'W1', window.navTargetId);
        if (newPath) {
          currentPath = newPath;
          currentWaypointIndex = 1;
          isArrived = false;
        }
      }

      if (navArrow && currentPath && currentPath.length > 0 && !isArrived) {
        const delta = clock.getDelta();
        const currentTargetId = currentPath[currentWaypointIndex];
        const targetWaypoint = storeData?.waypoints[currentTargetId];
        const userPos = positionProvider.position;

        if (targetWaypoint) {
          navArrow.updatePosition(camera.position, camera.quaternion);
          navArrow.setTarget(userPos, targetWaypoint);

          const dist = getDistance(
            { x: userPos.x, z: userPos.z, label: '' },
            targetWaypoint
          );

          window.navDebug = {
            targetId: currentTargetId,
            targetPos: `(${targetWaypoint.x}, ${targetWaypoint.z})`,
            distance: dist.toFixed(2),
            isArrived
          };

          const proximityRadius = storeData?.proximity_radius_m || 1.5;

          if (dist < proximityRadius) {
            if (currentWaypointIndex < currentPath.length - 1) {
              currentWaypointIndex++;
            } else {
              isArrived = true;
              if (window.navDebug) window.navDebug.isArrived = true;
            }
          }

          navArrow.update(delta);
        }
      }
    },
  };
};

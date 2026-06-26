import * as THREE from 'three';
import { positionProvider } from './ar-core/position_provider';
import { NavigationArrow } from './ar-navigate/arrow';
import { findShortestPath, getDistance } from './ar-navigate/navigation';
import { StoreData } from './ar-navigate/store_loader';

declare const XR8: any;

export const initScenePipelineModule = (storeData: StoreData | null) => {
  let navArrow: NavigationArrow | null = null;
  const clock = new THREE.Clock();

  let currentPath: string[] = [];
  let currentWaypointIndex = 0;
  let isArrived = false;

  // ponytail: variables for segment-based drift correction to avoid accumulated SLAM scale errors
  let last_provider_pos = new THREE.Vector3(0, 0, 0);
  let prev_waypoint_pos = new THREE.Vector3(0, 0, 0);
  let is_segment_initialized = false;

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
      const startId = positionProvider.nav_start_id || 'W1';
      const targetId = positionProvider.nav_target_id || 'W5';
      const path = findShortestPath(storeData.waypoints, storeData.edges, startId, targetId);
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
      if (storeData && positionProvider.nav_target_id && currentPath.length > 0 && currentPath[currentPath.length - 1] !== positionProvider.nav_target_id) {
        const startId = positionProvider.nav_start_id || 'W1';
        const newPath = findShortestPath(storeData.waypoints, storeData.edges, startId, positionProvider.nav_target_id);
        if (newPath) {
          currentPath = newPath;
          currentWaypointIndex = 1;
          isArrived = false;
          is_segment_initialized = false;
        }
      }

      if (navArrow && currentPath && currentPath.length > 0 && !isArrived) {
        const delta = clock.getDelta();
        const currentTargetId = currentPath[currentWaypointIndex];
        const targetWaypoint = storeData?.waypoints[currentTargetId];
        const provider_pos = positionProvider.position;

        if (targetWaypoint) {
          // Initialize segment origin when starting a new leg of navigation
          if (!is_segment_initialized) {
            const prev_id = currentPath[currentWaypointIndex - 1];
            const prev_wp = storeData?.waypoints[prev_id];
            if (prev_wp) {
              prev_waypoint_pos.set(prev_wp.x, provider_pos.y, prev_wp.z);
            } else {
              prev_waypoint_pos.set(0, provider_pos.y, 0);
            }
            last_provider_pos.copy(provider_pos);
            is_segment_initialized = true;
          }

          // Calculate delta movement from the last waypoint using calibrated coords
          const delta_pos = new THREE.Vector3().subVectors(provider_pos, last_provider_pos);
          
          // Adjusted position starts from the real waypoint coords + camera delta
          const adjusted_user_pos = new THREE.Vector3().addVectors(prev_waypoint_pos, delta_pos);

          navArrow.updatePosition(camera.position, camera.quaternion);
          navArrow.setTarget(adjusted_user_pos, targetWaypoint);

          const dist = getDistance(
            { x: adjusted_user_pos.x, z: adjusted_user_pos.z, label: '' },
            targetWaypoint
          );

          positionProvider.nav_debug = {
            targetId: currentTargetId,
            targetPos: `(${targetWaypoint.x}, ${targetWaypoint.z})`,
            distance: dist.toFixed(2),
            isArrived
          };

          const proximity_radius = storeData?.proximity_radius_m || 1.5;

          if (dist < proximity_radius) {
            if (currentWaypointIndex < currentPath.length - 1) {
              currentWaypointIndex++;
              is_segment_initialized = false; // Trigger re-init for the next segment
            } else {
              isArrived = true;
              if (positionProvider.nav_debug) positionProvider.nav_debug.isArrived = true;
            }
          }

          navArrow.update(delta);
        }
      }
    },
  };
};

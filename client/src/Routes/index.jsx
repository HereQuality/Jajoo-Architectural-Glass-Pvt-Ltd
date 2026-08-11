import React from "react";
import { Routes, Route } from "react-router-dom";
import RoleRoute from "./RoleRoute";
import HomeRedirect from "./HomeRedirect";

// Layouts
import NonAuthLayout from "../Layouts/NonAuthLayout";
import Layout from "../Layouts/Layout";

// Routes
import { protectedRoutes, publicRoutes } from "./allRoutes";

const Index = () => {
  return (
    <Routes>
      {publicRoutes.map((route, idx) => (
        <Route
          key={idx}
          path={route.path}
          element={<NonAuthLayout>{route.component}</NonAuthLayout>}
        />
      ))}

      {/* Bare "/home" sends the user to their own "/<roleSlug>/home". */}
      <Route path="/home" element={<HomeRedirect />} />

      {/* Every role — SuperAdmin and every Employee — shares this one
          "/:roleSlug/..." tree. Defined once in allRoutes.jsx. */}
      {protectedRoutes.map((route, idx) => (
        <Route
          key={idx}
          path={`/:roleSlug${route.path}`}
          element={
            <RoleRoute allowedRoles={route.roles}>
              <Layout>{route.component}</Layout>
            </RoleRoute>
          }
        />
      ))}
    </Routes>
  );
};

export default Index;
